import os
from urllib.request import Request, urlopen

MODEL_URL = "https://huggingface.co/ReLU007Rider/airbnb-room-type-model/resolve/main/Model_pipeline.pkl"

def download_model():
    model_path = "Model_pipeline.pkl"

    if not os.path.exists(model_path):
        print("Downloading model...")

        request = Request(
            MODEL_URL,
            headers={"User-Agent": "Mozilla/5.0"}
        )

        with urlopen(request) as response, open(model_path, "wb") as f:
            while True:
                chunk = response.read(8192)
                if not chunk:
                    break
                f.write(chunk)

        print("Model downloaded successfully.")
    else:
        print("Model already exists.")