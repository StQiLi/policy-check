Rack::Attack.enabled = ENV.fetch('RACK_ATTACK_ENABLED', 'true') == 'true'

Rack::Attack.throttle('api/ip', limit: ENV.fetch('RATE_LIMIT_PER_HOUR', '1000').to_i, period: 1.hour) do |req|
  req.ip if req.path.start_with?('/api/')
end

Rack::Attack.throttle('api/token', limit: ENV.fetch('RATE_LIMIT_PER_HOUR', '100').to_i, period: 1.hour) do |req|
  req.env['HTTP_AUTHORIZATION'] if req.path.start_with?('/api/')
end

Rack::Attack.throttled_responder = lambda do |env|
  match_data   = env['rack.attack.match_data'] || {}
  retry_after  = match_data[:period] || 3600
  now          = Time.now.utc.to_i

  [
    429,
    {
      'Content-Type'        => 'application/json',
      'Retry-After'         => retry_after.to_s,
      'X-RateLimit-Limit'   => (match_data[:limit] || 0).to_s,
      'X-RateLimit-Remaining' => '0'
    },
    [{
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retry_after: now + retry_after
      }
    }.to_json]
  ]
end
