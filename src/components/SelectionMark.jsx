import Icon from './Icon.jsx';

export default function SelectionMark({ selected, className = '' }) {
  return <span aria-hidden="true" className={`selection-mark ${selected ? 'checked' : ''} ${className}`.trim()}>{selected && <Icon name="check" size={13} strokeWidth={2.4}/>}</span>;
}
