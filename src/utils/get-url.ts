export const getURL = () => {
    let url =
        process.env.NEXT_PUBLIC_SITE_URL ?? // Prioritize the custom production URL
        process.env.NEXT_PUBLIC_VERCEL_URL ?? // Fallback to Vercel deployment URL
        'http://localhost:3000/' // Local development fallback

    // Ensure protocol is present
    url = url.includes('http') ? url : `https://${url}`

    // Remove trailing slash if present
    url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url

    return url
}
