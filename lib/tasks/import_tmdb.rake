require 'csv'
require 'open-uri'
require 'fileutils'
require 'net/http'

namespace :tmdb do
  desc 'Download and import TMDB movies dataset'
  task :import => :environment do
    # Configuration
    batch_size = ENV.fetch('BATCH_SIZE', 5000).to_i
    download_path = Rails.root.join('tmp', 'tmdb-movies.zip')
    extract_dir = Rails.root.join('tmp', 'tmdb_extract')
    csv_path = Rails.root.join('tmp', 'TMDB_movie_dataset_v11.csv')
    kaggle_url = ENV.fetch('KAGGLE_URL', 'https://www.kaggle.com/api/v1/datasets/download/asaniczka/tmdb-movies-dataset-2023-930k-movies')
    import_method = ENV.fetch('IMPORT_METHOD', 'direct').downcase # 'direct' or 'activerecord'

    # Ensure tmp directories exist
    FileUtils.mkdir_p(Rails.root.join('tmp'))
    FileUtils.mkdir_p(extract_dir) unless File.exist?(extract_dir)

    # Step 1: Download the dataset (if needed)
    if File.exist?(download_path) && !ENV['FORCE_DOWNLOAD']
      puts "Dataset zip already exists at #{download_path}. Skipping download."
      puts "Use FORCE_DOWNLOAD=true to re-download."
    else
      puts "Downloading TMDB dataset..."
      download_with_progress(kaggle_url, download_path)
    end

    # Step 2: Extract the CSV file directly to a known location
    if File.exist?(csv_path) && !ENV['FORCE_EXTRACT']
      puts "CSV file already exists at #{csv_path}. Skipping extraction."
      puts "Use FORCE_EXTRACT=true to re-extract."
    else
      puts "Extracting dataset..."

      # First check if the downloaded file is valid
      unless File.size(download_path) > 0
        puts "Error: Downloaded file is empty (0 bytes)"
        exit 1
      end

      puts "Zip file size: #{File.size(download_path)} bytes"

      # Extract the specific CSV file directly to the desired location
      system("unzip -j #{download_path} TMDB_movie_dataset_v11.csv -d #{Rails.root.join('tmp')}")

      # Verify the CSV file looks good
      if File.size(csv_path) == 0
        puts "Error: Extracted CSV file is empty!"
        exit 1
      end
    end

    puts "CSV file size: #{File.size(csv_path)} bytes"

    # Step 3: Import the data using ActiveRecord batch import
    start_time = Time.now
    activerecord_batch_import(csv_path, batch_size)
    end_time = Time.now

    puts "Total import time: #{(end_time - start_time).round(2)} seconds"

    # Clean up temporary files
    puts "Cleaning up temporary files..."
    File.delete(download_path) if File.exist?(download_path)
    File.delete(csv_path) if File.exist?(csv_path)

    puts "TMDB import completed!"
  end

  private

  # Helper for escaping CSV values
  def csv_escape(value)
    return "" if value.nil?
    # Replace quotes with double quotes and wrap in quotes if needed
    value = value.to_s
    if value.include?(',') || value.include?('"') || value.include?("\n")
      '"' + value.gsub('"', '""') + '"'
    else
      value
    end
  end

  # Original ActiveRecord batch import method
  def activerecord_batch_import(csv_path, batch_size)
    puts "Using ActiveRecord batch import (batch size: #{batch_size})..."

    # Initialize counters
    total_rows = 0
    imported_rows = 0
    skipped_rows = 0

    begin
      # Count total rows for progress reporting (use wc for better performance)
      puts "Counting total rows in CSV file..."
      wc_output = `wc -l #{csv_path}`.strip
      total_rows = wc_output.split.first.to_i - 1  # Subtract 1 for header row
      puts "Total movies to process: #{total_rows}"
    rescue => e
      puts "Error counting rows: #{e.message}"
      puts "Continuing without total count..."
    end

    # Process the file in batches
    movies_batch = []
    start_time = Time.now

    CSV.foreach(csv_path, headers: true) do |row|
      begin
        # Only proceed if we have a valid ID
        if row['id'].blank?
          skipped_rows += 1
          next
        end

        # Convert release_date to proper format if present
        release_date = nil
        if row['release_date'].present?
          begin
            release_date = Date.parse(row['release_date'])
          rescue
            # Invalid date, leave as nil
          end
        end

        # Create movie hash with only the fields we care about
        movie = {
          tmdb_id: row['id'].to_i,
          imdb_id: row['imdb_id'],
          title: row['title'],
          original_title: row['original_title'],
          vote_average: row['vote_average'].to_f,
          vote_count: row['vote_count'].to_i,
          release_date: release_date,
          runtime: row['runtime'].to_i > 0 ? row['runtime'].to_i : nil,
          backdrop_path: row['backdrop_path'],
          poster_path: row['poster_path'],
          overview: row['overview'],
          popularity: row['popularity'].to_f,
          tagline: row['tagline'],
          genres: row['genres'] # Store as JSON string
        }

        movies_batch << Movie.new(movie)


        # Process batch when it reaches the batch size
        if movies_batch.size >= batch_size
          movies_batch.uniq! { |movie| movie.tmdb_id }
          result = Movie.import movies_batch, on_duplicate_key_update: {
            conflict_target: [:tmdb_id],
            columns: [:imdb_id, :title, :original_title, :vote_average, :vote_count,
                      :release_date, :runtime, :backdrop_path, :poster_path, :overview,
                      :popularity, :tagline, :genres, :updated_at]
          }

          imported_rows += result.ids.size
          puts "Processed #{imported_rows} movies so far (#{(imported_rows.to_f / total_rows * 100).round(2)}% complete)" if total_rows > 0

          movies_batch = []
        end
      rescue => e
        puts "Error processing row: #{e.message}"
        skipped_rows += 1
      end
    end

    # Import remaining movies in the batch
    unless movies_batch.empty?
      movies_batch.uniq! { |movie| movie.tmdb_id }
      result = Movie.import movies_batch, on_duplicate_key_update: {
        conflict_target: [:tmdb_id],
        columns: [:imdb_id, :title, :original_title, :vote_average, :vote_count,
                  :release_date, :runtime, :backdrop_path, :poster_path, :overview,
                  :popularity, :tagline, :genres, :updated_at]
      }
      imported_rows += result.ids.size
    end

    # Print summary
    end_time = Time.now
    duration = (end_time - start_time).round(2)

    puts "Import completed in #{duration} seconds"
    puts "Total movies imported: #{imported_rows}"
    puts "Skipped rows: #{skipped_rows}"
  end

  # Helper method to download file with progress bar
  def download_with_progress(url, output_path)
    begin
      uri = URI(url)

      # Start with a HEAD request to get file size
      file_size = nil
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https') do |http|
        response = http.request_head(uri.path)
        file_size = response['content-length'].to_i if response['content-length']
      end

      if file_size.nil?
        puts "Warning: Could not determine file size, progress will not be shown."
      else
        puts "File size: #{(file_size / 1_048_576.0).round(2)} MB"
      end

      # Start the download with GET request
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https') do |http|
        request = Net::HTTP::Get.new(uri)

        http.request(request) do |response|
          case response
          when Net::HTTPSuccess
            bytes_downloaded = 0
            progress_bar_width = 50 # Width of progress bar

            File.open(output_path, 'wb') do |file|
              response.read_body do |chunk|
                file.write(chunk)

                # Update progress
                bytes_downloaded += chunk.size
                if file_size
                  percent = bytes_downloaded.to_f / file_size
                  completed = (progress_bar_width * percent).round
                  remaining = progress_bar_width - completed

                  print "\r[" + "#" * completed + " " * remaining + "] "
                  print "#{(percent * 100).round(1)}% "
                  print "(#{(bytes_downloaded / 1_048_576.0).round(2)}/#{(file_size / 1_048_576.0).round(2)} MB)"
                else
                  print "\rDownloaded: #{(bytes_downloaded / 1_048_576.0).round(2)} MB"
                end
              end
            end
            puts "\nDownload completed successfully!"
          when Net::HTTPRedirection
            # Follow redirect
            location = response['location']
            puts "Redirecting to: #{location}"
            download_with_progress(location, output_path)
          else
            raise "HTTP Error: #{response.code} - #{response.message}"
          end
        end
      end

    rescue StandardError => e
      puts "Error downloading file: #{e.message}"
      if File.exist?(output_path)
        puts "Removing partially downloaded file..."
        File.delete(output_path)
      end

      puts "\nAlternative download options:"
      puts "1. Download manually from https://www.kaggle.com/datasets/asaniczka/tmdb-movies-dataset-2023-930k-movies"
      puts "2. Place the file at #{output_path}"
      puts "3. Run this task again"

      exit 1
    end
  end
end
