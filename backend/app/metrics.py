from prometheus_client import Counter, Gauge, Histogram

embedding_seconds_histogram = Histogram(
    "attendx_embedding_seconds",
    "Time inside detection and embedding",
    buckets=[0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0],
)

match_total_counter = Counter(
    "attendx_match_total",
    "Total face match attempts by outcome",
    ["outcome"],
)

inflight_inference_gauge = Gauge(
    "attendx_inflight_inference",
    "Number of face inferences currently in flight",
)
