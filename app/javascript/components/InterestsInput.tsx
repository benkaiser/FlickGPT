import { h, Fragment } from 'preact';
import { Dispatch } from 'preact/hooks';
import * as Papa from 'papaparse';
import { MovieSearchInput } from './MovieSearchInput';
import { Movie, Rating } from '../types';

export type InterestType = 'imdb' | 'favorites' | 'genres';

interface InterestsInputProps {
  interestType: InterestType;
  setInterestType: Dispatch<InterestType>;
  ratingsFile: File | null;
  setRatingsFile: Dispatch<File | null>;
  topRatings: Rating[];
  setTopRatings: Dispatch<Rating[]>;
  allTitles: string[];
  setAllTitles: Dispatch<string[]>;
  favoriteMovies: Movie[];
  setFavoriteMovies: Dispatch<Movie[]>;
  selectedGenres: string[];
  setSelectedGenres: Dispatch<string[]>;
  isProcessingFile: boolean;
  setIsProcessingFile: Dispatch<boolean>;
  error: string | null;
  setError: Dispatch<string | null>;
}

const ALL_GENRES = [ // Example list, expand as needed
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
    "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"
];


export const InterestsInput = (props: InterestsInputProps) => {
  const {
    interestType, setInterestType,
    ratingsFile, setRatingsFile,
    topRatings, setTopRatings,
    allTitles, setAllTitles,
    favoriteMovies, setFavoriteMovies,
    selectedGenres, setSelectedGenres,
    isProcessingFile, setIsProcessingFile,
    error, setError
  } = props;

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      setRatingsFile(file);
      processRatingsFile(file); // Process immediately on selection
    } else {
      setRatingsFile(null);
      setTopRatings([]);
      setAllTitles([]);
    }
  };

  const processRatingsFile = async (file: File): Promise<void> => {
    setIsProcessingFile(true);
    setError(null);
    setTopRatings([]); // Clear previous results
    setAllTitles([]);

    try {
      const { topRatings, allTitles } = await parseRatingsCsv(file);
      setTopRatings(topRatings);
      setAllTitles(allTitles);
      setError(null); // Clear any previous error
    } catch (err) {
      setError(err instanceof Error ? `Error processing ratings file: ${err.message}` : String(err));
      setRatingsFile(null); // Clear the invalid file
      setTopRatings([]);
      setAllTitles([]);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const parseRatingsCsv = (file: File): Promise<{ topRatings: Rating[], allTitles: string[] }> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
            return;
          }

          try {
            const allRatings: Rating[] = results.data
              .filter((row: any) => row['Const'] && row['Your Rating']) // Use any temporarily if row structure varies
              .map((row: any) => ({
                imdb_id: row['Const'],
                user_rating: parseInt(row['Your Rating'], 10),
                date_rated: row['Date Rated'],
                title: row['Title']?.replace(/"/g, ''),
                year: parseInt(row['Year'], 10),
                genres: row['Genres'],
                // Add other fields if needed, ensure they exist in CSV or handle missing values
              }));

            if (allRatings.length === 0) {
                reject(new Error("No valid ratings found in the CSV file. Ensure it has 'Const', 'Your Rating', 'Title', and 'Year' columns."));
                return;
            }

            const allTitles = allRatings
              .map(rating => `${rating.title} (${rating.year})`)
              .slice(0, 2000);

            const topRatings = [...allRatings]
              .sort((a, b) => {
                if (b.user_rating !== a.user_rating) {
                  return b.user_rating - a.user_rating;
                }
                return new Date(b.date_rated).getTime() - new Date(a.date_rated).getTime();
              })
              .slice(0, 1000);

            resolve({ topRatings, allTitles });
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Error processing CSV data'));
          }
        },
        error: (error: Papa.ParseError) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        }
      });
    });
  };

  const handleGenreChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const genre = target.value;
    if (target.checked) {
      if (selectedGenres.length < 3) {
        setSelectedGenres([...selectedGenres, genre]);
      } else {
        // Prevent checking more than 3 - provide feedback?
        target.checked = false;
        // Optionally show a message to the user
      }
    } else {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    }
  };

  const renderActiveTabContent = () => {
    switch (interestType) {
      case 'imdb':
        return (
          <div>
            <p className="text-muted small">Upload your IMDb ratings CSV export. We'll analyze your top 1000 rated shows, and make sure to skip recommending the next 2000 you have rated.</p>
            <div className="mb-3">
              <input
                type="file"
                className="form-control"
                accept=".csv"
                onChange={handleFileChange}
                disabled={isProcessingFile}
                key={ratingsFile ? 'file-selected' : 'no-file'} // Force re-render if file is cleared
              />
              {ratingsFile && !isProcessingFile && topRatings.length === 0 && !error && (
                 <small className="text-danger d-block mt-1">Could not process the selected file. Please ensure it's a valid IMDb ratings export.</small>
              )}
              {isProcessingFile && <small className="text-muted d-block mt-1">Processing file...</small>}
                {!isProcessingFile && topRatings.length > 0 && (
                <small className="text-success d-block mt-1">
                  {topRatings.length} top ratings used
                  {allTitles.length > topRatings.length && `, ${allTitles.length - topRatings.length} more movies skipped.`}
                </small>
                )}
            </div>
          </div>
        );
      case 'favorites':
        return (
          <div>
             <p className="text-muted small">Search for and add some of your favorite movies or TV shows.</p>
            <MovieSearchInput
              selectedMovies={favoriteMovies}
              setSelectedMovies={setFavoriteMovies}
            />
          </div>
        );
      case 'genres':
        return (
          <div>
            <p className="text-muted small">Select up to 3 genres you enjoy.</p>
            <div className="row row-cols-2 row-cols-sm-3 g-2">
              {ALL_GENRES.map(genre => (
                <div className="col" key={genre}>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      value={genre}
                      id={`genre-${genre}`}
                      checked={selectedGenres.includes(genre)}
                      onChange={handleGenreChange}
                      disabled={selectedGenres.length >= 3 && !selectedGenres.includes(genre)}
                    />
                    <label className="form-check-label" htmlFor={`genre-${genre}`}>
                      {genre}
                    </label>
                  </div>
                </div>
              ))}
            </div>
             {selectedGenres.length >= 3 && <small className="text-muted d-block mt-2">Maximum 3 genres selected.</small>}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Fragment>
      <ul className="nav nav-tabs nav-fill">
        <li className="nav-item">
          <button
            className={`nav-link ${interestType === 'imdb' ? 'active' : ''}`}
            onClick={() => setInterestType('imdb')}
            type="button"
          >
            IMDb Ratings
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${interestType === 'favorites' ? 'active' : ''}`}
            onClick={() => setInterestType('favorites')}
            type="button"
          >
            Favorite Movies/Shows
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${interestType === 'genres' ? 'active' : ''}`}
            onClick={() => setInterestType('genres')}
            type="button"
          >
            Favorite Genres
          </button>
        </li>
      </ul>
      <div className="tab-content p-3 border border-top-0">
        {renderActiveTabContent()}
      </div>
    </Fragment>
  );
};
