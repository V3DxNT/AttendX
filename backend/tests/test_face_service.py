import base64
from unittest.mock import MagicMock
import cv2
import numpy as np
import pytest

from app.errors import AppError
import app.face_service as fs
from app.face_service import (
    create_face_thumbnail,
    decode_image_base64,
)

def make_blank_image_b64(width=200, height=200) -> str:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def test_decode_image_valid():
    b64 = make_blank_image_b64(100, 100)
    img = decode_image_base64(b64)
    assert isinstance(img, np.ndarray)
    assert img.shape[0] == 100
    assert img.shape[1] == 100

def test_decode_image_invalid():
    with pytest.raises(AppError) as exc_info:
        decode_image_base64("not-valid-base64-content!@#$")
    assert exc_info.value.code == "INVALID_IMAGE"

def test_create_face_thumbnail():
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    bbox = [50.0, 50.0, 150.0, 150.0]
    thumb = create_face_thumbnail(img, bbox)
    assert thumb.startswith("data:image/")
    raw_b64 = thumb.split(",")[1]
    decoded = base64.b64decode(raw_b64)
    nparr = np.frombuffer(decoded, np.uint8)
    thumb_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    assert thumb_img.shape == (96, 96, 3)

def test_sync_detect_zero_faces():
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    mock_app = MagicMock()
    mock_app.get.return_value = []
    old_app = fs._face_app
    fs._face_app = mock_app
    try:
        with pytest.raises(AppError) as exc_info:
            fs._sync_detect_and_embed(img)
        assert exc_info.value.code == "NO_FACE_DETECTED"
    finally:
        fs._face_app = old_app

def test_sync_detect_multiple_faces():
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    mock_app = MagicMock()
    mock_app.get.return_value = [MagicMock(), MagicMock()]
    old_app = fs._face_app
    fs._face_app = mock_app
    try:
        with pytest.raises(AppError) as exc_info:
            fs._sync_detect_and_embed(img)
        assert exc_info.value.code == "MULTIPLE_FACES_DETECTED"
    finally:
        fs._face_app = old_app

def test_sync_detect_face_too_small():
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    mock_face = MagicMock()
    mock_face.bbox = np.array([10.0, 10.0, 40.0, 40.0])
    mock_app = MagicMock()
    mock_app.get.return_value = [mock_face]
    old_app = fs._face_app
    fs._face_app = mock_app
    try:
        with pytest.raises(AppError) as exc_info:
            fs._sync_detect_and_embed(img)
        assert exc_info.value.code == "FACE_TOO_SMALL"
    finally:
        fs._face_app = old_app

def test_sync_detect_low_quality():
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    mock_face = MagicMock()
    mock_face.bbox = np.array([10.0, 10.0, 120.0, 120.0])
    mock_face.det_score = 0.45
    mock_app = MagicMock()
    mock_app.get.return_value = [mock_face]
    old_app = fs._face_app
    fs._face_app = mock_app
    try:
        with pytest.raises(AppError) as exc_info:
            fs._sync_detect_and_embed(img)
        assert exc_info.value.code == "LOW_QUALITY_FACE"
    finally:
        fs._face_app = old_app

def test_sync_detect_valid_face():
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    mock_face = MagicMock()
    mock_face.bbox = np.array([10.0, 10.0, 120.0, 120.0])
    mock_face.det_score = 0.95
    normed_emb = np.random.randn(512).astype(np.float32)
    normed_emb /= np.linalg.norm(normed_emb)
    mock_face.normed_embedding = normed_emb

    mock_app = MagicMock()
    mock_app.get.return_value = [mock_face]
    old_app = fs._face_app
    fs._face_app = mock_app
    try:
        emb, thumb = fs._sync_detect_and_embed(img)
        assert len(emb) == 512
        assert thumb.startswith("data:image/")
    finally:
        fs._face_app = old_app
