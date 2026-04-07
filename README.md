# 사랑과 은총의 기계들

다리오 아모데이의 에세이 「Machines of Loving Grace」 한국어 번역과 웹 리더 작업을 함께 담은 저장소입니다.

이 저장소는 두 가지 목적을 함께 가집니다.

- 인디자인 편집용 원고와 번역 자산 보존
- GitHub Pages로 배포 가능한 웹 리더 운영

## 주요 구조

- `02 원고/`: 번역 마스터 원고, RTF, 용어집
- `scripts/`: 원고 변환과 검증용 스크립트
- `web/`: 실제 배포 대상인 정적 웹 리더

GitHub Pages에는 저장소 전체가 아니라 `web/` 폴더만 배포됩니다.

## 로컬 실행

원고 데이터가 바뀌었다면 먼저 웹용 JSON을 다시 생성합니다.

```powershell
python .\scripts\build_web_manuscript.py
```

그 다음 로컬 서버를 열고 브라우저에서 확인합니다.

```powershell
python -m http.server 8000
```

브라우저 주소:

```text
http://localhost:8000/web/
```

## GitHub Pages 배포

이 저장소에는 `.github/workflows/deploy-pages.yml`이 포함되어 있습니다. 기본 브랜치 `main`에 푸시되면 `web/` 폴더를 GitHub Pages로 배포합니다.

처음 한 번은 GitHub 저장소 설정에서 다음만 확인하면 됩니다.

1. 저장소 `Settings`로 이동
2. `Pages` 메뉴 열기
3. `Build and deployment`의 `Source`를 `GitHub Actions`로 설정

GitHub 공식 문서:

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 첫 업로드 예시

빈 GitHub 저장소를 만든 뒤 아래 순서로 연결하면 됩니다.

```powershell
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<YOUR_ACCOUNT>/<YOUR_REPO>.git
git push -u origin main
```
