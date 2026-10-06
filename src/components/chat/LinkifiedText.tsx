import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[).,!?;:'"\]]+$/;

/** Renders plain text with clickable links. Everything is rendered as React text nodes (no raw HTML). */
export function LinkifiedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const trailing = TRAILING_PUNCTUATION.exec(part)?.[0] ?? "";
        const url = trailing ? part.slice(0, -trailing.length) : part;
        const href = url.startsWith("http") ? url : `https://${url}`;
        return (
          <Fragment key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </p>
  );
}
