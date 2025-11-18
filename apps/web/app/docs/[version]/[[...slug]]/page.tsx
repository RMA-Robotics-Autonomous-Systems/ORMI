import { notFound } from 'next/navigation'
import { getDocBySlug, getLatestVersion, getVersions } from '@/lib/mdx/docs'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import remarkGfm from 'remark-gfm'

// Import your UI components for use in MDX
import { Button } from '@workspace/ui/components/button'
import { Card } from '@workspace/ui/components/card'

const components = {
    Button,
    Card,
    // Add more components as needed
}

interface PageProps {
    params: Promise<{
        version: string
        slug?: string[]
    }>
}

export async function generateStaticParams() {
    const versions = getVersions()
    const params: { version: string; slug?: string[] }[] = []

    // Generate params for each version
    for (const version of versions) {
        params.push({ version, slug: undefined })
    }

    return params
}

export async function generateMetadata({ params }: PageProps) {
    const { version, slug } = await params
    const doc = await getDocBySlug(version, slug || [])

    if (!doc) {
        return {
            title: 'Not Found',
        }
    }

    return {
        title: `${doc.metadata.title} - ORMI Documentation`,
        description: doc.metadata.description,
    }
}

export default async function DocPage({ params }: PageProps) {
    const { version, slug } = await params
    const doc = await getDocBySlug(version, slug || ['index'])

    if (!doc) {
        notFound()
    }

    return (
        <article className="prose prose-slate dark:prose-invert max-w-none">
            <MDXRemote
                source={doc.content}
                components={components}
                options={{
                    mdxOptions: {
                        remarkPlugins: [remarkGfm],
                        rehypePlugins: [
                            rehypeSlug,
                            rehypeHighlight,
                            [rehypeAutolinkHeadings, { behavior: 'wrap' }],
                        ],
                    },
                }}
            />
        </article>
    )
}
