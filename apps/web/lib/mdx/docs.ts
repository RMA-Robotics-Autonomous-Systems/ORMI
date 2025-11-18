import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const docsDirectory = path.join(process.cwd(), 'content/docs')

export interface DocMetadata {
  title: string
  description?: string
  slug: string
  path: string
}

export interface DocContent {
  metadata: DocMetadata
  content: string
}

/**
 * Get all available documentation versions
 */
export function getVersions(): string[] {
  const versions = fs.readdirSync(docsDirectory)
    .filter(item => {
      const itemPath = path.join(docsDirectory, item)
      return fs.statSync(itemPath).isDirectory()
    })
  
  return versions.sort().reverse() // Latest version first
}

/**
 * Get the latest version
 */
export function getLatestVersion(): string {
  const versions = getVersions()
  return versions[0] || 'v1'
}

/**
 * Read and parse a markdown file
 */
export async function getDocBySlug(version: string, slug: string[]): Promise<DocContent | null> {
  try {
    const slugPath = slug.join('/')
    const versionPath = path.join(docsDirectory, version)
    
    // Try different file extensions
    const possiblePaths = [
      path.join(versionPath, `${slugPath}.md`),
      path.join(versionPath, `${slugPath}.mdx`),
      path.join(versionPath, slugPath, 'index.md'),
      path.join(versionPath, slugPath, 'index.mdx'),
    ]
    
    let filePath: string | null = null
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p
        break
      }
    }
    
    if (!filePath) {
      return null
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContents)
    
    // Extract title from frontmatter or first heading
    let title = data.title || ''
    if (!title) {
      const match = content.match(/^#\s+(.+)$/m)
      title = match ? match[1] : slug[slug.length - 1]
    }
    
    return {
      metadata: {
        title,
        description: data.description,
        slug: slugPath,
        path: filePath,
      },
      content,
    }
  } catch (error) {
    console.error(`Error reading doc: ${version}/${slug.join('/')}`, error)
    return null
  }
}

/**
 * Get all documentation files for a version
 */
export function getAllDocs(version: string): DocMetadata[] {
  const versionPath = path.join(docsDirectory, version)
  
  if (!fs.existsSync(versionPath)) {
    return []
  }
  
  const docs: DocMetadata[] = []
  
  function walkDirectory(dir: string, basePath: string = '') {
    const files = fs.readdirSync(dir)
    
    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      
      if (stat.isDirectory()) {
        walkDirectory(filePath, path.join(basePath, file))
      } else if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const slug = path.join(basePath, file.replace(/\.(md|mdx)$/, ''))
        const fileContents = fs.readFileSync(filePath, 'utf8')
        const { data, content } = matter(fileContents)
        
        let title = data.title || ''
        if (!title) {
          const match = content.match(/^#\s+(.+)$/m)
          title = match ? match[1] : file.replace(/\.(md|mdx)$/, '')
        }
        
        docs.push({
          title,
          description: data.description,
          slug: slug.replace(/\\/g, '/'), // Normalize path separators
          path: filePath,
        })
      }
    }
  }
  
  walkDirectory(versionPath)
  return docs
}
