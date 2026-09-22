export default function P(){return <><div className="eyebrow">CONNECTIONS</div><h1>Connect your business.</h1><div className="settingsgrid">{["Instagram Business","Facebook Page","LinkedIn","WooCommerce","Shopify","Google Business"].map((x: any)=><div className="card"><h3>{x}</h3><p>Not connected</p>{x === "Instagram Business" ? (
  <a href="/api/social/instagram/connect">
    <button type="button">Connect</button>
  </a>
) : (
  <button type="button">Connect</button>
)}</div>)}</div></>}