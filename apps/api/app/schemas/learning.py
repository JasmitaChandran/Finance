from __future__ import annotations

from pydantic import BaseModel


class LessonResponse(BaseModel):
    id: str
    title: str
    level: str
    duration_minutes: int
    summary: str


class TutorRequest(BaseModel):
    question: str
