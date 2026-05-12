import os
from urllib import response
from google import genai
from typer import prompt

# ✅ SAFE: Use environment variable
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

from pypdf import PdfReader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaLLM


# -----------------------------
# 🔥 Load embedding model ONCE
# -----------------------------
embeddings = HuggingFaceEmbeddings(
    model_name="all-MiniLM-L6-v2"
)

# -----------------------------
# 🔥 Load LLM ONCE (faster)
# -----------------------------
ollama_llm = OllamaLLM(
    model="phi3",
    temperature=0,
    num_predict=150
)


# -----------------------------
# 1. Load PDFs
# -----------------------------
def get_pdf_documents(folder_path):
    documents = []

    for file in os.listdir(folder_path):
        if file.endswith(".pdf"):
            pdf_path = os.path.join(folder_path, file)
            pdf_reader = PdfReader(pdf_path)

            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    documents.append(
                        Document(
                            page_content=page_text,
                            metadata={
                                "source": file,
                                "page": i + 1
                            }
                        )
                    )

    return documents


# -----------------------------
# 2. Chunk documents
# -----------------------------
def get_text_chunks(documents):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=400,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " "]
    )
    return text_splitter.split_documents(documents)


# -----------------------------
# 3. Vector store (FIXED)
# -----------------------------
def get_vector_store(chunks, save_path="vectorstore"):
    faiss_file = os.path.join(save_path, "index.faiss")

    # 🔥 If exists → LOAD
    if os.path.exists(faiss_file):
        print("Loading existing vector store...")
        vector_store = FAISS.load_local(
            save_path,
            embeddings,
            allow_dangerous_deserialization=True
        )

        # 🔥 Append new data
        if chunks:
            # vector_store.add_documents(chunks)
            vector_store = get_vector_store(None)  # Rebuild with all documents
            vector_store.save_local(save_path)

        return vector_store

    # 🔥 If not exists → CREATE new
    print("Creating new vector store...")
    vector_store = FAISS.from_documents(chunks, embedding=embeddings)

    os.makedirs(save_path, exist_ok=True)
    vector_store.save_local(save_path)

    return vector_store


# -----------------------------
# 4. Ollama Chat (FAST)
# -----------------------------
def chat_with_pdf(vector_store, user_question, chat_history):
    docs = vector_store.similarity_search(user_question, k=2)
    

    context = "\n\n".join([doc.page_content for doc in docs])

    history_text = "\n".join([
        f"User: {q}\nAssistant: {a}" for q, a in chat_history
    ])

    prompt = f"""
You are an intelligent assistant helping users understand documents.

Use ONLY the provided context to answer the question.
If the answer is not in the context, say "Not found in document".

Give a clear, structured, and complete answer.

Context:
{context}

Question:
{user_question}

Answer:
"""

    # answer = ollama_llm.invoke(prompt)
    response = ""

    for chunk in ollama_llm.stream(prompt):
     response += chunk

    answer = response


    sources = list(set(
    f"{doc.metadata['source']} (Page {doc.metadata['page']})"
    for doc in docs
))

    return answer, sources


# -----------------------------
# 5. Gemini Chat (FIXED)
# -----------------------------
def chat_with_gemini(vector_store, user_question, chat_history):
    docs = vector_store.similarity_search(user_question, k=2)

    context = "\n\n".join([doc.page_content[:300] for doc in docs])

    history_text = "\n".join([
        f"User: {q}\nAssistant: {a}" for q, a in chat_history
    ])

    prompt = f"""
You are an intelligent assistant helping users understand documents.

Use ONLY the provided context to answer the question.
If the answer is not in the context, say "Not found in document".

Give a clear, structured, and complete answer.

Context:
{context}

Question:
{user_question}

Answer:
"""

    # ✅ Use a model from your available list
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt
    )

    sources = [
        f"{doc.metadata['source']} (Page {doc.metadata['page']})"
        for doc in docs
    ]

    if hasattr(response, "text") and response.text:
        answer = response.text
    else:
        try:
            answer = response.candidates[0].content.parts[0].text
        except:
            answer = "Sorry, I couldn't generate a response."

    return answer, sources