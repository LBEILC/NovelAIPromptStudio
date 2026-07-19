import Icon from './Icon.jsx';

export default function SelectionMark({ selected, className = '' }) {
  return <span className={`selection-mark ${selected ? 'selected' : ''} ${className}`.trim()} aria-hidden="true">
    {selected && <Icon name="check" size={12} strokeWidth={2.6}/>}
  </span>;
}
