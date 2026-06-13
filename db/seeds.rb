Post.find_or_create_by!(title: "Hello World") do |p|
  p.body = "Welcome to the demo blog!"
  p.published = true
end

Post.find_or_create_by!(title: "Getting Started with Rails") do |p|
  p.body = "Rails makes web development fun and productive."
  p.published = true
end

Post.find_or_create_by!(title: "Draft Post") do |p|
  p.body = "This post is not yet published."
  p.published = false
end
