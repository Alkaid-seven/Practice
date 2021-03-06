const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

function stepOne(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const ast = parser.parse(content, {
    sourceType: 'module' // ES module
  });
  
  const dependencies = {};
  
  //遍历AST抽象语法树
  traverse(ast, {
    //获取通过import引入的模块
    ImportDeclaration({node}) {
      const dirname = path.dirname(filename);
      const newFile = './' + path.join(dirname, node.source.value)
      //保存所依赖的模块
      dependencies[node.source.value] = newFile;
    }
  });
  
  //通过@babel/core和@babel/preset-env进行代码的转换
  const {code} = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"]
  });
  
  return {
    filename,
    dependencies,
    code
  }
}

function stepTwo(entry) {
  const entryModule = stepOne(entry);
  const graphArray = [entryModule];
  
  for (let i = 0; i < graphArray.length; i++) {
    const item = graphArray[i];
    const {dependencies} = item;
    
    for (let j in dependencies) {
      graphArray.push(
        stepOne(dependencies[j]) //入口模块及其所有相关的模块放入数组
      )
    }
  }
  
  //生成依赖图谱
  
  const graph = {};
  graphArray.forEach(item => {
    graph[item.filename] = {
      dependencies: item.dependencies,
      code: item.code
    }
  });
  
  return graph;
}

// console.log(stepTwo('./index.js'));

function stepThree(entry) {
  const graph = JSON.stringify(stepTwo(entry));
  
  return `
  (function (graph) {
    //require函数的本质是执行一个模块的代码，然后将相应变量挂载到exports对象上
    function require(module) {
      //localRequire的本质是拿到依赖包的exports变量
      function localRequire(relativePath) {
        return require(graph[module].dependencies[relativePath]);
      }
      
      var exports = {};
      (function (require, exports, code) {
        console.log("..................")
        console.log(code)
        eval(code);
        console.log("..................")
      })(localRequire, exports, graph[module].code);
      
      //函数返回指向局部变量，形成闭包，exports变量在函数执行后不会被摧毁
      return exports;
    }
    
    require('${entry}')
  })(${graph})
  `
}

console.log(stepThree('./index.js'));
