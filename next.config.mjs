/** @type {import('next').NextConfig} */const nextConfig={
serverExternalPackages:["@resvg/resvg-js"],
poweredByHeader:false,
reactStrictMode:true,
outputFileTracingIncludes:{
  "/api/media/[id]/publish":[
    "./public/fonts/noto-sans-latin-400-normal.woff"
  ]
},
experimental:{serverActions:{bodySizeLimit:"2mb"}},headers:async()=>[{source:"/(.*)",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"}]}]};export default nextConfig;