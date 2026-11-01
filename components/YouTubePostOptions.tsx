"use client";

import styles from "./PostOptions.module.css";

type Visibility = "public" | "unlisted" | "private";
type Props = {
  disabled?: boolean;
  privacy: Visibility;
  onPrivacyChange: (value: Visibility) => void;
  madeForKids: boolean;
  onMadeForKidsChange: (value: boolean) => void;
  synthetic: boolean;
  onSyntheticChange: (value: boolean) => void;
  certified: boolean;
  onCertifiedChange: (value: boolean) => void;
};

export default function YouTubePostOptions({ disabled = false, privacy, onPrivacyChange, madeForKids, onMadeForKidsChange, synthetic, onSyntheticChange, certified, onCertifiedChange }: Props) {
  return <section aria-label="YouTube settings" className={styles.options}>
    <strong>YouTube</strong>
    <label className={styles.field}>Visibility
      <select aria-label="Visibility" disabled={disabled} value={privacy} onChange={event => onPrivacyChange(event.target.value as Visibility)}>
        <option value="public">Public</option>
        <option value="unlisted">Unlisted</option>
        <option value="private">Private</option>
      </select>
    </label>
    <label className={styles.check}><input type="checkbox" disabled={disabled} checked={madeForKids} onChange={event => onMadeForKidsChange(event.target.checked)} /><span>Made for kids</span></label>
    <label className={styles.check}><input type="checkbox" disabled={disabled} checked={synthetic} onChange={event => onSyntheticChange(event.target.checked)} /><span>Realistic altered or synthetic content</span></label>
    <label className={`${styles.check} ${styles.consent}`}>
      <input type="checkbox" disabled={disabled} checked={certified} onChange={event => onCertifiedChange(event.target.checked)} />
      <span>I approve this upload, have the video rights, and confirm it follows YouTube’s <a href="https://www.youtube.com/howyoutubeworks/policies/community-guidelines/" target="_blank" rel="noopener noreferrer">Community Guidelines</a> and <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">Terms</a>.</span>
    </label>
  </section>;
}
