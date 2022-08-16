const getDirectiveOrValue = (directive: string, value: string): string => `
#ifdef ${directive}
	${directive}
#else
	${value}
#endif
`;

export { getDirectiveOrValue };
