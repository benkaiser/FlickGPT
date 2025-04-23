import { h } from 'preact';
import { Dispatch } from 'preact/hooks';

type MediaType = 'movie' | 'tv' | 'both';

interface MediaTypeSelectorProps {
  selectedMediaType: MediaType;
  setSelectedMediaType: Dispatch<MediaType>;
}

const OPTIONS: { value: MediaType, label: string }[] = [
    { value: 'movie', label: 'Movies Only' },
    { value: 'tv', label: 'TV Shows Only' },
    { value: 'both', label: 'Movies & TV Shows' }
];

export const MediaTypeSelector = ({ selectedMediaType, setSelectedMediaType }: MediaTypeSelectorProps) => {
  return (
    <div>
      <label className="form-label">Media Type</label>
      <div className="btn-group w-100" role="group" aria-label="Media type selection">
        {OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            className={`btn ${selectedMediaType === option.value ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSelectedMediaType(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
