import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const releaseNotesSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

export default function ReleaseNotes({ children, onOpenLink }) {
  const components = useMemo(() => ({
    a: ({ node: _node, href = '', ...props }) => <a
      {...props}
      href={href}
      onClick={(event) => {
        if (!onOpenLink) return;
        event.preventDefault();
        onOpenLink(href);
      }}
    />,
  }), [onOpenLink]);

  return <article className="settings-release-notes-content">
    <ReactMarkdown
      components={components}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, releaseNotesSchema]]}
      remarkPlugins={[remarkGfm]}
    >{String(children || '')}</ReactMarkdown>
  </article>;
}
