class YoutubeService
  require 'net/http'
  require 'json'

  def self.search(query)
    response = Net::HTTP.get(URI("https://www.youtube.com/results?search_query=#{URI.encode_www_form_component(query)}"))

    # Extract initial data from the response
    initial_data = extract_initial_data(response)

    begin
      # Get the contents from the parsed JSON structure
      contents = if initial_data['contents']['twoColumnSearchResultsRenderer']
                   initial_data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents']
                 else
                   initial_data['contents']['twoColumnWatchNextResults']['secondaryResults']['secondaryResults']['results']
                 end

      # Filter for video renderers and map to video IDs
      videos = contents.map { |item| item['videoRenderer'] || item['compactVideoRenderer'] }.compact

      # Return the first video ID if available
      first_video = videos.first
      return first_video['videoId'] if first_video && first_video['videoId']
    rescue => e
      Rails.logger.error("Failed to parse YouTube search results: #{e.message}")
      return nil
    end
  end

  private

  def self.extract_initial_data(response_text)
    # Extract ytInitialData from the response
    match = response_text.match(/var\s+ytInitialData\s*=\s*({.+?});\s*<\/script>/m) ||
            response_text.match(/window\["ytInitialData"\]\s*=\s*({.+?});\s*<\/script>/m)

    if match && match[1]
      return JSON.parse(match[1])
    else
      raise "Unable to extract initial data from YouTube response"
    end
  end
end