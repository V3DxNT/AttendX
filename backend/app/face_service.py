import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
import re
import time
from typing import List, Optional, Tuple
import cv2
import numpy as np

from app.config import settings
from app.errors import AppError
from app.metrics import (
    embedding_seconds_histogram,
    inflight_inference_gauge,
    match_total_counter,
)

_face_app = None
_executor: Optional[ThreadPoolExecutor] = None
_semaphore: Optional[asyncio.Semaphore] = None

def get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=2)
    return _executor

def get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(2)
    return _semaphore

def init_face_model() -> None:
    global _face_app
    try:
        from insightface.app import FaceAnalysis
        app = FaceAnalysis(
            name="buffalo_l",
            root=settings.INSIGHTFACE_HOME,
            providers=["CPUExecutionProvider"],
            allowed_modules=["detection", "recognition"],
        )
        app.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = app
    except Exception:
        _face_app = None

def is_model_loaded() -> bool:
    return _face_app is not None

def shutdown_face_service() -> None:
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=True)
        _executor = None

def decode_image_base64(image_base64: str) -> np.ndarray:
    raw_data = image_base64.strip()
    match = re.match(r"^data:(image/[a-zA-Z0-9\+\-\.]+);base64,(.+)$", raw_data, re.DOTALL)
    if match:
        mime = match.group(1).lower()
        if mime not in ("image/jpeg", "image/jpg", "image/png", "image/webp"):
            raise AppError(
                code="INVALID_IMAGE",
                message="Unsupported image format. Allowed formats: jpeg, png, webp",
                status_code=422,
            )
        b64_str = match.group(2)
    else:
        b64_str = raw_data

    try:
        image_bytes = base64.b64decode(b64_str, validate=True)
    except Exception:
        raise AppError(
            code="INVALID_IMAGE",
            message="Invalid base64 encoding",
            status_code=422,
        )

    if len(image_bytes) > settings.MAX_IMAGE_BYTES:
        raise AppError(
            code="IMAGE_TOO_LARGE",
            message=f"Image exceeds maximum size of {settings.MAX_IMAGE_BYTES} bytes",
            status_code=413,
        )

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise AppError(
            code="INVALID_IMAGE",
            message="Failed to decode image data",
            status_code=422,
        )

    h, w = img.shape[:2]
    longest = max(h, w)
    if longest > 1280:
        scale = 1280.0 / float(longest)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    return img

def create_face_thumbnail(img: np.ndarray, bbox: List[float]) -> str:
    h, w = img.shape[:2]
    x1, y1, x2, y2 = bbox
    bw = x2 - x1
    bh = y2 - y1

    pad_w = 0.2 * bw
    pad_h = 0.2 * bh

    crop_x1 = max(0, int(x1 - pad_w))
    crop_y1 = max(0, int(y1 - pad_h))
    crop_x2 = min(w, int(x2 + pad_w))
    crop_y2 = min(h, int(y2 + pad_h))

    cropped = img[crop_y1:crop_y2, crop_x1:crop_x2]
    if cropped.size == 0:
        cropped = img

    resized = cv2.resize(cropped, (96, 96), interpolation=cv2.INTER_AREA)

    success, buf = cv2.imencode(".webp", resized, [cv2.IMWRITE_WEBP_QUALITY, 60])
    mime = "image/webp"
    if not success:
        success, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 70])
        mime = "image/jpeg"

    encoded = base64.b64encode(buf.tobytes()).decode("utf-8")
    return f"data:{mime};base64,{encoded}"

def _sync_detect_and_embed(img: np.ndarray) -> Tuple[List[float], str]:
    if _face_app is None:
        raise AppError(
            code="INTERNAL_SERVER_ERROR",
            message="Face analysis model is not loaded",
            status_code=500,
        )

    start_time = time.perf_counter()
    faces = _face_app.get(img)
    duration = time.perf_counter() - start_time
    embedding_seconds_histogram.observe(duration)

    if not faces or len(faces) == 0:
        match_total_counter.labels(outcome="no_face").inc()
        raise AppError(
            code="NO_FACE_DETECTED",
            message="No face detected in the image",
            status_code=422,
        )

    if len(faces) > 1:
        match_total_counter.labels(outcome="multiple_faces").inc()
        raise AppError(
            code="MULTIPLE_FACES_DETECTED",
            message="Multiple faces detected in the image",
            status_code=409,
        )

    face = faces[0]
    bbox = face.bbox.tolist()
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    shorter_side = min(bw, bh)

    if shorter_side < 80:
        raise AppError(
            code="FACE_TOO_SMALL",
            message="Face bounding box is too small (minimum 80px required)",
            status_code=422,
        )

    det_score = float(face.det_score) if hasattr(face, "det_score") else 1.0
    if det_score < 0.60:
        raise AppError(
            code="LOW_QUALITY_FACE",
            message="Face detection confidence is too low",
            status_code=422,
        )

    embedding = face.normed_embedding.tolist()
    thumbnail = create_face_thumbnail(img, bbox)
    return embedding, thumbnail

async def process_face_image(image_base64: str) -> Tuple[List[float], str]:
    img = decode_image_base64(image_base64)
    sem = get_semaphore()
    loop = asyncio.get_running_loop()
    executor = get_executor()

    await sem.acquire()
    inflight_inference_gauge.inc()
    try:
        embedding, thumbnail = await loop.run_in_executor(
            executor, _sync_detect_and_embed, img
        )
        return embedding, thumbnail
    finally:
        inflight_inference_gauge.dec()
        sem.release()
