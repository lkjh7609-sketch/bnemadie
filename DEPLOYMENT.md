# 무료 배포 가이드 (Vercel + Render)

## 1. 백엔드 배포 (Render)

### 단계별 가이드:

1. **Render 계정 생성**
   - https://render.com 접속
   - GitHub 계정으로 회원가입

2. **새 Web Service 생성**
   - Dashboard > "New +" > "Web Service" 선택
   - GitHub 저장소 연결
   - 이 프로젝트의 `backend` 디렉토리 선택

3. **서비스 설정**
   - **Name**: `email-assistant-backend` (원하는 이름)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. **환경 변수 설정**
   - "Environment" 탭에서 추가:
   ```
   ANTHROPIC_API_KEY=
   ANTHROPIC_BASE_URL=https://aiapiflow.com
   NODE_ENV=production
   ```

5. **배포 시작**
   - "Create Web Service" 클릭
   - 배포 완료까지 약 5-10분 소요
   - 배포 URL 복사: `https://your-backend-app.onrender.com`

### 주의사항:
- Render 무료 티어는 15분간 요청이 없으면 서버가 sleep 상태로 전환됩니다
- 첫 요청 시 30초 정도 cold start 시간이 필요합니다
- 월 750시간 무료 사용 가능 (1개 서비스 24/7 운영 가능)

---

## 2. 프론트엔드 배포 (Vercel)

### 단계별 가이드:

1. **Vercel 계정 생성**
   - https://vercel.com 접속
   - GitHub 계정으로 회원가입

2. **환경 변수 설정 파일 수정**
   - `email-assistant-web/.env.production` 파일 열기
   - Render에서 받은 백엔드 URL로 수정:
   ```
   VITE_API_URL=https://your-backend-app.onrender.com/api
   ```

3. **프로젝트 Import**
   - Vercel Dashboard > "Add New" > "Project"
   - GitHub 저장소 선택
   - Root Directory를 `email-assistant-web`으로 설정

4. **빌드 설정 확인**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

5. **환경 변수 추가**
   - "Environment Variables" 섹션에서:
   ```
   VITE_API_URL=https://your-backend-app.onrender.com/api
   ```

6. **배포 시작**
   - "Deploy" 클릭
   - 배포 완료까지 약 2-3분 소요
   - 배포 URL: `https://your-project.vercel.app`

### 주의사항:
- Vercel 무료 티어는 월 100GB 대역폭, 100GB-Hours 빌드 시간 제공
- 자동 HTTPS, CDN, 무제한 배포 제공
- 코드 변경 시 자동 재배포

---

## 3. 백엔드 CORS 설정 업데이트

배포 후 프론트엔드 URL이 확정되면, 백엔드의 `server.js`에서 CORS origin에 추가:

```javascript
await fastify.register(cors, {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://your-project.vercel.app',  // 여기에 실제 Vercel URL 추가
    /\.vercel\.app$/,
    /\.netlify\.app$/
  ],
  credentials: true
})
```

---

## 4. 친구와 링크 공유

배포 완료 후:
1. Vercel 프론트엔드 URL을 친구에게 전송: `https://your-project.vercel.app`
2. 친구는 계정 생성 없이 해당 URL 접속
3. 자동 인증으로 바로 사용 가능

---

## 5. 무료 티어 제한사항

### Render (백엔드):
- ✅ 월 750시간 무료 (24/7 운영 가능)
- ⚠️ 15분 비활성화 시 sleep
- ⚠️ cold start 30초 소요
- ✅ 무제한 배포

### Vercel (프론트엔드):
- ✅ 월 100GB 대역폭
- ✅ 100GB-Hours 빌드 시간
- ✅ 무제한 배포
- ✅ 자동 HTTPS
- ✅ 글로벌 CDN

---

## 6. 대안 플랫폼

만약 Render의 cold start가 불편하다면:
- **Railway**: 더 빠른 cold start, $5 무료 크레딧
- **Fly.io**: 더 나은 성능, 3개 앱 무료

프론트엔드 대안:
- **Netlify**: Vercel과 유사, 월 100GB 무료
- **Cloudflare Pages**: 무제한 무료, 빠른 CDN

---

## 문제 해결

### CORS 에러 발생 시:
1. 백엔드 `server.js`의 CORS origin에 프론트엔드 URL 추가 확인
2. Render에서 재배포 (Dashboard > Manual Deploy)

### 프론트엔드에서 백엔드 연결 실패:
1. `.env.production` 파일의 `VITE_API_URL` 확인
2. Vercel Environment Variables 확인
3. Vercel에서 재배포

### Render 서버가 sleep 상태:
- 첫 요청 시 30초 대기
- 또는 Render Dashboard에서 "Manual Deploy" 클릭하여 깨우기
