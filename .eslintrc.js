module.exports = {
	'extends': 'standard',
	'plugins': [
		'standard'
	],
	'env': {
		'browser': false,
		'node': true,
		'es6': true,
		'mocha': true
	},
	'rules': {
		'semi': ['error', 'always'],
		'quotes': ['warn', 'double'],
		'indent': ['warn', 'tab', {
			'SwitchCase': 1
		}],
		'space-in-parens': ['warn', 'always'],
		'object-curly-spacing': ['warn', 'always', {
			'arraysInObjects': true,
			'objectsInObjects': true
		}],
		'array-bracket-spacing': ['warn', 'always', {
			'singleValue': true,
			'arraysInArrays': true,
			'objectsInArrays': true
		}],
		'space-before-function-paren': ['warn', 'never'],
		'space-infix-ops': ['warn'],
		'no-multiple-empty-lines': ['warn', {
			'max': 4,
			'maxEOF': 1,
			'maxBOF': 0,
		}],
		'valid-jsdoc': ['error', {
			'requireReturn': false,
			'requireReturnType': true,
			'requireParamDescription': false,
			'requireReturnDescription': false
		}],
		'require-jsdoc': ['error', {
			'require': {
				'FunctionDeclaration': true,
				'MethodDefinition': true,
				'ClassDeclaration': true,
				'ArrowFunctionExpression': false
			}
		}],
		'no-mixed-spaces-and-tabs': ['warn', 'smart-tabs'],
		'key-spacing': ['warn', {
			'beforeColon': false,
			'mode': 'strict'
		}],
		'comma-style': ['warn', 'last'],
		'no-return-assign': ['warn', 'except-parens'],
		'no-unused-vars': ['warn', {
			'args': 'after-used'
		}]
	}
};
