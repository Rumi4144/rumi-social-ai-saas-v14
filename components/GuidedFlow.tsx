"use client";

import {useEffect, useRef, type ReactNode} from "react";
import styles from "./guided-flow.module.css";

export default function GuidedFlow({steps, step, onStep, children, blocked, busy, action, saved}: {
  steps: string[]; step: number; onStep: (step: number) => void; children: ReactNode;
  blocked?: string; busy?: boolean; action?: ReactNode; saved?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current !== step) {
      heading.current?.focus({preventScroll: true});
      heading.current?.scrollIntoView({block: "start", behavior: "instant"});
    }
    previous.current = step;
  }, [step]);
  return <div className={styles.flow}>
    <ol className={styles.steps} aria-label="Your progress">
      {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>
        <span>{index < step ? "✓" : index + 1}</span>{label}
      </li>)}
    </ol>
    <h2 ref={heading} tabIndex={-1} className={styles.heading}>Step {step + 1} of {steps.length}: {steps[step]}</h2>
    <div className={styles.content}>{children}</div>
    <footer className={styles.footer}>
      <div className={styles.buttons}>
        <button type="button" disabled={busy || step === 0} onClick={() => onStep(step - 1)}>Back</button>
        {step < steps.length - 1
          ? <button className="button" type="button" disabled={busy || !!blocked} aria-describedby={blocked ? "flow-blocker" : undefined} onClick={() => onStep(step + 1)}>Continue</button>
          : action}
      </div>
      {blocked && <p id="flow-blocker" role="status">{blocked}</p>}
      {saved && <small role="status">{saved}</small>}
    </footer>
  </div>;
}
