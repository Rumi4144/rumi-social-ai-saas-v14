"use client";
import { useRouter } from "next/navigation";
import type { WeeklyItem } from "@/lib/weekly/types";
import WeeklyCard from "./WeeklyCard";
import styles from "./weekly.module.css";

export default function ScheduledWorkspace({ items, canManage }: { items: WeeklyItem[]; canManage: boolean }) {
  const router = useRouter();
  return <div className={styles.workspace}><header className={styles.header}><div><span className={styles.eyebrow}>Your delivery queue</span><h1>Scheduled & needs attention</h1><p>See upcoming posts and any destination that needs help. Successfully posted items leave this queue once all destinations are complete.</p></div><a href="/dashboard">← This Week</a></header><div className={styles.toolbar}><button onClick={() => router.refresh()}>Refresh status</button><a href="/settings">Manage connected accounts</a></div>{items.length ? <div className={styles.grid}>{items.map(item => <WeeklyCard key={item.id} item={item} canManage={canManage} onChanged={() => router.refresh()} />)}</div> : <section className={styles.empty}><h2>You’re all caught up</h2><p>No posts are waiting for delivery. Review this week’s posts to schedule your next one.</p><a href="/dashboard">Review this week →</a></section>}</div>;
}
