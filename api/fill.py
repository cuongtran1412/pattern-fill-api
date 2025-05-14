# Vercel serverless function
from PIL import Image
import numpy as np
import cv2
import requests
import io
import base64

def download_image(url):
    resp = requests.get(url)
    return Image.open(io.BytesIO(resp.content))

def handler(request, response):
    data = request.json()
    pattern_url = data["pattern_url"]
    rap_url = data["rap_url"]

    pattern = download_image(pattern_url).convert("RGB")
    rap = download_image(rap_url).convert("RGB")
    pattern = pattern.resize(rap.size)

    rap_np = np.array(rap)
    pattern_np = np.array(pattern)

    gray = cv2.cvtColor(rap_np, cv2.COLOR_RGB2GRAY)
    _, mask = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)
    mask_inv = cv2.bitwise_not(mask)

    filled = cv2.bitwise_and(pattern_np, pattern_np, mask=mask_inv)
    result_np = cv2.addWeighted(filled, 1, rap_np, 0.6, 0)
    result = Image.fromarray(result_np)

    buffer = io.BytesIO()
    result.save(buffer, format="PNG")
    encoded_img = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return response.json({ "image_base64": encoded_img })
