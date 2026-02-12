from __future__ import annotations

from fastapi import APIRouter

from app.schemas.learning import TutorRequest
from app.services.ai_service import ai_service

router = APIRouter(prefix="/learning", tags=["learning"])

LESSONS = [
    {
        "id": "basics-1",
        "title": "What Is a Stock?",
        "level": "Beginner",
        "duration_minutes": 8,
        "summary": "Understand ownership, share price, and why companies list publicly.",
    },
    {
        "id": "ratios-1",
        "title": "P/E, ROE, and Profit Margin",
        "level": "Beginner",
        "duration_minutes": 12,
        "summary": "Decode core metrics with plain-English examples and red flags.",
    },
    {
        "id": "risk-1",
        "title": "Diversification in Real Life",
        "level": "Beginner",
        "duration_minutes": 10,
        "summary": "Learn how to avoid concentration risk and emotional investing mistakes.",
    },
]


@router.get("/lessons")
def list_lessons():
    return {"items": LESSONS}


@router.post("/tutor")
async def tutor(payload: TutorRequest):
    return await ai_service.tutor_answer(payload.question)
