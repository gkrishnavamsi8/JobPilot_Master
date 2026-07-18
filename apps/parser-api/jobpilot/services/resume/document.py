"""Structured representation of resume text lines."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ResumeLine:
    text: str
    index: int
    font_size: float | None = None
    is_header: bool = False
    section: str | None = None

    @property
    def stripped(self) -> str:
        return self.text.strip()


@dataclass
class ResumeDocument:
    raw_text: str
    lines: list[ResumeLine] = field(default_factory=list)
    sections: dict[str, list[ResumeLine]] = field(default_factory=dict)
    hyperlinks: list[str] = field(default_factory=list)

    @classmethod
    def from_text(cls, text: str) -> ResumeDocument:
        text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
        raw_lines = [ln.rstrip() for ln in text.split("\n")]
        lines = [
            ResumeLine(text=ln, index=i)
            for i, ln in enumerate(raw_lines)
            if ln.strip()
        ]
        return cls(raw_text=text, lines=lines)

    def non_empty_lines(self) -> list[str]:
        return [ln.stripped for ln in self.lines]

    def section_text(self, name: str) -> list[str]:
        return [ln.stripped for ln in self.sections.get(name, [])]

    def full_text(self) -> str:
        return "\n".join(self.non_empty_lines())
