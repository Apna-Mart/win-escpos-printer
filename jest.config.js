module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src', '<rootDir>/__tests__'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	collectCoverageFrom: [
		'src/**/*.{ts,js}',
		'!src/**/*.d.ts',
		'!src/native/**',
	],
	setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};