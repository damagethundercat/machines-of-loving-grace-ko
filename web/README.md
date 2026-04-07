# Web Reader

`사랑과 은총의 기계들` 웹 리더입니다. 번역 원고 `02 원고/02_번역_마스터.md`를 기반으로 정적 데이터를 만들고, 페이지형 웹 리더로 렌더링합니다.

## 구성

- `assets/`: 표지와 웹 리더용 이미지 자산
- `data/manuscript.json`: 웹 리더가 읽는 구조화 원고 데이터
- `index.html`: 진입 HTML
- `styles.css`: 리더 레이아웃과 타이포그래피 스타일
- `main.js`: 페이지네이션, 렌더링, 목차, 각주, 인터랙션 로직

## 원고 재생성

```powershell
python .\scripts\build_web_manuscript.py
```

## 로컬 미리보기

```powershell
python -m http.server 8000
```

브라우저에서 아래 주소를 열면 됩니다.

```text
http://localhost:8000/web/
```

## 메모

- 웹 리더는 정적 사이트이며, GitHub Pages 배포 대상은 `web/` 폴더입니다.
- 각주와 목차, 페이지 슬라이더, 본문 글자 크기 조절은 클라이언트 측 자바스크립트로 동작합니다.
