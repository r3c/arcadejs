const getDirectiveOrValue = (directive: string, value: string) => `
#ifdef ${directive}
	${directive}
#else
	${value}
#endif
`;

export { getDirectiveOrValue }