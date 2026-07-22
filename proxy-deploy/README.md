# drive.grudge-studio.com — thin reverse proxy

**Do not ship the Babylon grudge-drive SPA here.**

Production game = Cloudflare Pages `grudge-velocity` (Three.js Houston Cruise).  
This Vercel project only reverse-proxies so the browser origin stays `drive.grudge-studio.com`
(SSO return URL / same-origin modules).

Deploy:

```bash
cd F:\GitHub\grudge-drive\proxy-deploy
npx vercel deploy --prod --yes
```

If filesystem still wins, ensure this directory has **no** `index.html` and no `assets/`.
