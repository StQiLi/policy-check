require 'openai'

class PolicyExtractor
  FIELDS = %w[returnWindow conditionRequirements fees returnShipping exclusions].freeze

  SYSTEM_PROMPT = <<~PROMPT.freeze
    You are a policy analyst for an e-commerce browser extension. Given the raw text
    of a store's return/refund policy, extract the following fields into concise,
    human-readable summaries (1-2 short sentences each). If a field cannot be
    determined from the text, return null.

    Fields:
    - returnWindow: How long customers have to return items (e.g. "30 days from delivery").
    - conditionRequirements: What condition items must be in (e.g. "Unworn with tags attached and original packaging").
    - fees: Any restocking or return fees (e.g. "15% restocking fee" or "No fees").
    - returnShipping: Who pays for return shipping (e.g. "Customer pays return shipping" or "Free prepaid label provided").
    - exclusions: Item categories excluded from returns (e.g. "Final sale, swimwear, and gift cards").

    Rules:
    - Be factual. Only state what the policy text says.
    - Use plain, neutral language. Never say "scam", "fraudulent", or "avoid".
    - Keep each value under 120 characters.
    - If the text is not a return/refund policy or is too short to extract anything, return all fields as null.

    Return valid JSON matching this exact schema:
    {
      "fields": {
        "returnWindow": string | null,
        "conditionRequirements": string | null,
        "fees": string | null,
        "returnShipping": string | null,
        "exclusions": string | null
      },
      "confidence": {
        "returnWindow": "low" | "medium" | "high",
        "conditionRequirements": "low" | "medium" | "high",
        "fees": "low" | "medium" | "high",
        "returnShipping": "low" | "medium" | "high",
        "exclusions": "low" | "medium" | "high"
      }
    }
  PROMPT

  MAX_TEXT_LENGTH = 8000

  def initialize(text:, domain: nil)
    @text = text.to_s[0, MAX_TEXT_LENGTH]
    @domain = domain
  end

  def call
    return empty_result if @text.strip.length < 50

    response = client.chat(
      parameters: {
        model: model_name,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: "Policy text from #{@domain || 'unknown store'}:\n\n#{@text}" }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 600
      }
    )

    parse_response(response)
  rescue Faraday::Error, OpenAI::Error => e
    Rails.logger.error("PolicyExtractor OpenAI error: #{e.class} - #{e.message}")
    empty_result
  rescue JSON::ParserError => e
    Rails.logger.error("PolicyExtractor JSON parse error: #{e.message}")
    empty_result
  end

  private

  def client
    @client ||= OpenAI::Client.new(access_token: api_key)
  end

  def api_key
    ENV.fetch('OPENAI_API_KEY') { raise 'OPENAI_API_KEY is not set' }
  end

  def model_name
    ENV.fetch('OPENAI_MODEL', 'gpt-4o-mini')
  end

  def parse_response(response)
    content = response.dig('choices', 0, 'message', 'content')
    raise JSON::ParserError, 'Empty response from OpenAI' if content.blank?

    parsed = JSON.parse(content)
    fields = parsed['fields'] || {}
    confidence = parsed['confidence'] || {}

    {
      fields: sanitize_fields(fields),
      confidence: sanitize_confidence(confidence)
    }
  end

  def sanitize_fields(fields)
    FIELDS.each_with_object({}) do |key, hash|
      val = fields[key]
      hash[key] = val.is_a?(String) && val.present? ? val[0, 120] : nil
    end
  end

  def sanitize_confidence(confidence)
    valid_levels = %w[low medium high]
    FIELDS.each_with_object({}) do |key, hash|
      val = confidence[key]
      hash[key] = valid_levels.include?(val) ? val : 'low'
    end
  end

  def empty_result
    null_fields = FIELDS.each_with_object({}) { |k, h| h[k] = nil }
    low_confidence = FIELDS.each_with_object({}) { |k, h| h[k] = 'low' }
    { fields: null_fields, confidence: low_confidence }
  end
end
