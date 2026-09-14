"""
Multi-Task Agent Token Saver Helper Module for Python Users
사용자가 작성하는 파이썬 에이전트 스크립트에서 토큰을 자동으로 압축/절감하고
결과 데이터를 파이프라인으로 넘기기 쉽게 돕는 유틸리티 라이브러리입니다.
"""

import sys
import json
import re

def compress_text(raw_text: str) -> dict:
    """HTML 태그, 중복 공백, 주석 등을 정제하여 프롬프트 토큰을 절감합니다."""
    if not raw_text:
        return {"clean_text": "", "saved_tokens": 0}
    
    orig_len = len(raw_text)
    # HTML 태그 제거
    clean = re.sub(r'<[^>]+>', ' ', raw_text)
    # 연속 공백 축소
    clean = re.sub(r'\s+', ' ', clean).strip()
    
    saved_tokens = max(0, (orig_len - len(clean)) // 3)
    return {
        "clean_text": clean,
        "original_len": orig_len,
        "clean_len": len(clean),
        "saved_tokens": saved_tokens
    }

def get_pipeline_input() -> dict:
    """이전 연계 작업(Agent)이 전달한 데이터 컨텍스트를 읽어옵니다."""
    import os
    ctx_str = os.environ.get("TASK_CONTEXT", "{}")
    try:
        return json.loads(ctx_str)
    except Exception:
        return {}

def send_pipeline_output(data: dict):
    """다음 연계 작업(Agent)으로 넘겨줄 결과 데이터를 JSON으로 출력합니다."""
    output_str = json.dumps(data, ensure_ascii=False)
    print(f"RESULT_JSON:{output_str}", flush=True)

if __name__ == "__main__":
    print("⚡ [TokenSaver Helper] Loaded successfully.")
    sample = "<html><body><h1>Example Header</h1><p>Test data   with   many spaces</p></body></html>"
    compressed = compress_text(sample)
    print(f"Original Length: {compressed['original_len']} -> Cleaned: {compressed['clean_len']} (Estimated Saved Tokens: {compressed['saved_tokens']})")
