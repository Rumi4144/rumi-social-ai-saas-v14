declare module "twitter-text" {
  export function parseTweet(text: string): { valid: boolean; weightedLength: number };
}
