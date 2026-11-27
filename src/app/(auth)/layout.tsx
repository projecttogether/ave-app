import Image from 'next/image'

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen w-full bg-white">
            {/* Left side - Content */}
            <div className="flex w-full flex-col justify-center px-8 lg:w-1/2 lg:px-12 xl:px-24">
                <div className="mx-auto w-full max-w-sm lg:max-w-md">
                    <div className="mb-8 flex flex-col items-start gap-6">
                        <Image
                            src="/images/ave-logo.png"
                            alt="AVE Logo"
                            width={48}
                            height={48}
                            className="rounded-lg"
                        />
                        <h1 className="text-4xl font-medium font-heading tracking-tight text-gray-900 lg:text-6xl">
                            Anmeldung
                        </h1>
                    </div>
                    {/* Orange accent line similar to the vision page */}
                    <div className="mb-8 h-1.5 w-16 bg-[#f2733c] rounded-full"></div>

                    {children}
                </div>
            </div>

            {/* Right side - Visual */}
            <div className="hidden lg:block lg:w-1/2 relative bg-[#e8dfd6] overflow-hidden">
                {/* Organic Blobs - Decorative */}
                <div className="absolute top-[-5%] right-[-5%] h-64 w-64 rounded-full bg-[#f2733c] opacity-20 blur-3xl mix-blend-multiply"></div>
                <div className="absolute bottom-[-10%] left-[-10%] h-80 w-80 rounded-full bg-[#f2733c] opacity-20 blur-3xl mix-blend-multiply"></div>
            </div>
        </div>
    )
}
