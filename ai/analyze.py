import sys
import json
from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

file_path = sys.argv[1]
jd = sys.argv[2]

reader = PdfReader(file_path)
resume_text = ""
for page in reader.pages:
    resume_text += page.extract_text()

vectorizer = TfidfVectorizer()
vectors = vectorizer.fit_transform([resume_text, jd])

score = cosine_similarity(vectors[0:1], vectors[1:2])[0][0] * 100

response = {
    "score": round(score, 2),
    "matched": ["Python", "Machine Learning"]  # sample
}

print(json.dumps(response))
