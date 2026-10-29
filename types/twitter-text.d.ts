declare module "twitter-text" {
  const twitterText: {
    parseTweet(text: string): { valid: boolean; weightedLength: number };
    extractUrlsWithIndices(text: string): Array<{ url: string; indices: [number, number] }>;
  };
  export default twitterText;
}
