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

export default function ReleaseNotes({ children }) {
  return (
    <article className="settings-release-notes-content">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, [rehypeSanitize, releaseNotesSchema]]}
        remarkPlugins={[remarkGfm]}
      >
        {String(children || '')}
      </ReactMarkdown>
    </article>
  );
}
