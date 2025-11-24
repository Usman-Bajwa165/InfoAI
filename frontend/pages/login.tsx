import React from 'react';

export default function Login() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-3xl mb-6">Login to InfoAi</h1>
      <div className="space-y-4">
        <a
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}
        >
          Login with Google
        </a>
        <a
          className="px-6 py-3 bg-gray-800 text-white rounded hover:bg-gray-900"
          href={`${process.env.NEXT_PUBLIC_API_URL}/auth/github`}
        >
          Login with GitHub
        </a>
      </div>
    </div>
  );
}
