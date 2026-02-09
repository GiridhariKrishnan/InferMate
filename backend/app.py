from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import os

app = Flask(__name__)
CORS(app)  # Allow frontend to call this

# Use Zephyr 7B Beta as it is a high-quality free model often available on Inference API
HF_API_URL = "https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta"

@app.route('/scrape', methods=['POST'])
def scrape():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    if not url.startswith('http'):
        return jsonify({"error": "Please provide a valid URL starting with http"}), 400

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            return jsonify({"error": "Failed to fetch page"}), 500
            
        soup = BeautifulSoup(response.content, 'html.parser')
        
        paragraphs = soup.find_all('p')
        text_content = ' '.join([p.get_text() for p in paragraphs])
        
        summary = text_content[:5000] 
        
        return jsonify({
            "source": url,
            "title": soup.title.string if soup.title else url,
            "content": summary
        })

    except Exception as e:
        print(f"Scrape error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/chat/hf', methods=['POST'])
def chat_hf():
    try:
        data = request.json
        # Forward the request to Hugging Face
        # We don't send an auth header if not present, hoping for free tier access.
        # If the user sets HF_API_KEY env var for this python script, we use it.
        headers = {"Content-Type": "application/json"}
        api_key = os.environ.get("HF_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            
        response = requests.post(HF_API_URL, headers=headers, json=data)
        
        if response.status_code != 200:
             return jsonify({"error": f"HF API Error: {response.text}"}), response.status_code

        return jsonify(response.json())
    except Exception as e:
        print(f"HF Proxy Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Starting InferMate Backend on port 5000...")
    app.run(port=5000, debug=True)
