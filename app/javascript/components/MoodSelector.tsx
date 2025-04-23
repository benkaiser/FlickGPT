import { h } from 'preact';
import { Dispatch } from 'preact/hooks';

interface MoodSelectorProps {
  selectedMood: string;
  setSelectedMood: Dispatch<string>;
}

const MOODS = [
  "Whatever",
  "Need a Laugh",
  "Mind-Bender",
  "Edge-of-Your-Seat",
  "Critically Acclaimed",
  "Hidden Gem",
  "Heartwarming",
  "Dark & Gritty",
  "Action-Packed",
  "Nostalgic",
  "Romantic",
  "Sci-Fi Adventure",
  "Fantasy Escape",
  "Tear-Jerker",
  "Thought-Provoking",
  "Family Friendly",
  "Musical",
  "Historical Epic",
  "Documentary",
  "Supernatural",
  "Crime Drama",
  "Coming of Age",
  "Psychological Thriller",
  "Feel-Good",
  "Dystopian",
  "Animated Joy",
  "Foreign Language",
  "Cult Classic",
  "Visually Stunning",
  "Superhero",
  "Courtroom Drama",
  "Horror",
  "Sports Story",
  "Political Intrigue",
  "Social Commentary",
  "Mockumentary"
];

export const MoodSelector = ({ selectedMood, setSelectedMood }: MoodSelectorProps) => {
  return (
    <div>
      <label htmlFor="mood-select" className="form-label">Mood / Vibe</label>
      <select
        id="mood-select"
        className="form-select"
        value={selectedMood}
        onChange={(e) => setSelectedMood((e.target as HTMLSelectElement).value)}
      >
        {MOODS.map(mood => (
          <option key={mood} value={mood.toLowerCase().replace(/ /g, '-')}>
            {mood === 'Whatever' ? 'Any Mood (Default)' : mood}
          </option>
        ))}
      </select>
    </div>
  );
};
