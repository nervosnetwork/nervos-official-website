import { Blog } from "../../utils/blogs";
import { slugs } from "./list";
import { pick } from "../../utils";


const originSlugList = slugs;


export async function getAllBlogs<F extends (keyof Blog)[]>(sortBy = 'all', prefLang = 'en', fields?: F) {
  // console.time("db articles getAllBlogs record");
  const blogs = originSlugList.map(slug => {
    const blog: Blog = slug[prefLang as 'en'] || slug.en;
    if(fields?.length) {
      return pick(blog, ...fields)
    }
    return blog
  })

  blogs.sort((blog1, blog2) => {
    switch (sortBy) {
      case 'oldest post': {
        if (blog1?.date && blog2?.date) {
          return blog1?.date > blog2?.date ? 1 : -1
        }
        break
      }
      case 'newest post':
      case 'all': {
        if (blog1?.date && blog2?.date) {
          return blog1?.date > blog2?.date ? -1 : 1
        }
      }
      default: {
        const b1Categories = blog1?.category?.split(',').map(c => c.trim().toLowerCase()) ?? []
        const b2Categories = blog2?.category?.split(',').map(c => c.trim().toLowerCase()) ?? []
        if (b1Categories.includes(sortBy) && !b2Categories?.includes(sortBy)) {
          return -1
        } else if (!b1Categories.includes(sortBy) && b2Categories.includes(sortBy)) {
          return 1
        } else if (blog1?.date && blog2?.date) {
          return blog1?.date > blog2?.date ? -1 : 1
        }
      }
    }
    return 0
  })
  // console.timeEnd("db articles getAllBlogs record");
  return Promise.resolve(blogs)
}


export async function getBlogBySlug(slug: string, prefLang?: string): Promise<Blog>
export async function getBlogBySlug<F extends (keyof Blog)[]>(
  slug: string,
  prefLang: string | undefined,
  fields: F,
): Promise<Pick<Blog, F[number]>>
export async function getBlogBySlug<F extends (keyof Blog)[]>(
  slug: string,
  prefLang = 'en',
  fields?: F,
): Promise<Blog | Pick<Blog, F[number]>> {
  // console.time("db articles getBlogBySlug record");
  const slugObj = originSlugList.find(s => s.slug === slug);
  const blog: Blog = slugObj![prefLang as 'en'] || slugObj!.en;
  if(fields?.length) {
    return pick(blog, ...fields)
  }
  // console.timeEnd("db articles getBlogBySlug record");
  return Promise.resolve(blog);
}
