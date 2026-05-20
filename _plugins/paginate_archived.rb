class PaginatedArchivePage < Jekyll::Page
  def initialize(site, dir, posts_data, page_num, total_pages, per_page, total_archived)
    @site = site
    @base = site.source
    @dir = dir
    @name = 'index.html'
    @data = {}

    process(@name)

    @content = <<~LIQUID
{% if page.paginator.posts.size > 0 %}
  {% for post in page.paginator.posts %}
  <div class="post-preview">
      <a href="{{ post.url | prepend: site.baseurl }}">
          <h2 class="post-title">
              {{ post.title }}
          </h2>
          {% if post.subtitle %}
          <h3 class="post-subtitle">
              {{ post.subtitle }}
          </h3>
          {% endif %}
      </a>
      <p class="post-meta">
          Posted by {% if post.author %}{{ post.author }}{% else %}{{ site.title }}{% endif %} on {{ post.date | date: "%B %-d, %Y" }}
      </p>
  </div>
  <hr>
  {% endfor %}
{% else %}
  <p>暂无归档文章。</p>
{% endif %}

{% if page.paginator.total_pages > 1 %}
<nav>
  <ul class="pager">
    {% if page.paginator.previous_page %}
      <li class="previous">
        <a href="{{ page.paginator.previous_page_path | prepend: site.baseurl }}">&larr; Newer</a>
      </li>
    {% endif %}
    {% if page.paginator.next_page %}
      <li class="next">
        <a href="{{ page.paginator.next_page_path | prepend: site.baseurl }}">Older &rarr;</a>
      </li>
    {% endif %}
  </ul>
</nav>
{% endif %}
    LIQUID

    @data['layout'] = 'page'
    @data['title'] = 'ARCHIVE'
    @data['description'] = '归档文章列表'
    @data['paginator'] = {
      'posts' => posts_data,
      'page' => page_num,
      'per_page' => per_page,
      'total_posts' => total_archived,
      'total_pages' => total_pages,
      'previous_page' => page_num > 1 ? page_num - 1 : nil,
      'next_page' => page_num < total_pages ? page_num + 1 : nil,
      'previous_page_path' => page_num > 1 ? (page_num == 2 ? '/archive/' : "/archive/page/#{page_num - 1}/") : nil,
      'next_page_path' => page_num < total_pages ? "/archive/page/#{page_num + 1}/" : nil
    }
  end
end

class ArchivePagination < Jekyll::Generator
  safe true

  def generate(site)
    per_page = 25
    archived = site.posts.docs.select { |p| p.data['archived'] == true }
                             .sort_by { |p| -p.date.to_time.to_i }
    return if archived.empty?

    total_pages = (archived.size.to_f / per_page).ceil

    (1..total_pages).each do |page_num|
      offset = (page_num - 1) * per_page
      paged = archived[offset, per_page]
      dir = page_num == 1 ? '/archive/' : "/archive/page/#{page_num}/"
      site.pages << PaginatedArchivePage.new(site, dir, paged, page_num, total_pages, per_page, archived.size)
    end
  end
end
