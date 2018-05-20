const getBooleanDirectiveOrUniform = (directive: string, uniform: string) => `
#ifdef ${directive}
	bool(${directive})
#else
	${uniform}
#endif
`;

export { getBooleanDirectiveOrUniform }