# Create a development user with a known auth token for easy testing.
if Rails.env.development?
  user = User.find_or_create_by!(email: 'dev@returnclarity.local') do |u|
    u.auth_token = 'dev-token-for-local-testing'
  end

  puts "Development user ready:"
  puts "  email:      #{user.email}"
  puts "  auth_token: #{user.auth_token}"
  puts ""
  puts "Use this token in the extension or curl:"
  puts "  curl -H 'Authorization: Bearer #{user.auth_token}' http://localhost:3000/health"
end
