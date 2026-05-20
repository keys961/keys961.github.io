Jekyll::Hooks.register :posts, :post_init do |post|
  archived = post.data['archived'] == true
  post.data['archived'] = archived
end
