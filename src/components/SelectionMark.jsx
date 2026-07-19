import LobeCheckbox from '@lobehub/ui/es/Checkbox/index';

export default function SelectionMark({ selected, className = '' }) {
  return <LobeCheckbox checked={selected} className={`selection-mark ${className}`.trim()} size={18}/>;
}
