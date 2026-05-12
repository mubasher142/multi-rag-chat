from typing import TypedDict, List
from langgraph.graph import StateGraph, END
from langchain_core.documents import Document
from langchain_ollama import OllamaLLM


# -----------------------------
# Shared graph state
# -----------------------------
class GraphState(TypedDict):
    question: str
    docs: List[Document]
    context: str
    answer: str


# -----------------------------
# LLM
# -----------------------------
llm = OllamaLLM(
    model="phi3",
    temperature=0
)


# -----------------------------
# Retrieve node
# -----------------------------
def retrieve_node(state):

    print("🔍 RETRIEVE NODE")

    question = state["question"]

    from api import vector_store

    docs_with_scores = vector_store.similarity_search_with_score(
        question,
        k=4
    )

    docs = [doc[0] for doc in docs_with_scores[:2]]

    context = "\n\n".join(
        [doc.page_content[:400] for doc in docs]
    )

    return {
        "docs": docs,
        "context": context
    }


# -----------------------------
# Generate node
# -----------------------------
def generate_node(state):

    print("🧠 GENERATE NODE")

    prompt = f"""
Answer ONLY from the context.

Context:
{state['context']}

Question:
{state['question']}

Answer:
"""

    answer = llm.invoke(prompt)

    return {
        "answer": answer
    }


# -----------------------------
# Build graph
# -----------------------------
workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)

workflow.set_entry_point("retrieve")

workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

graph = workflow.compile()