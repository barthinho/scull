module.exports = {
	'rules': {
		'require-jsdoc': ['error', {
			'require': {
				'FunctionDeclaration': false,
				'MethodDefinition': false,
				'ClassDeclaration': false,
				'ArrowFunctionExpression': false
			}
		}]
	}
};
