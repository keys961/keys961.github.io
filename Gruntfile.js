module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            main: {
                src: 'js/site.js',
                dest: 'js/site.min.js'
            }
        },
        less: {
            expanded: {
                options: {
                    paths: ["css"]
                },
                files: {
                    "css/hux-blog.css": "less/hux-blog.less"
                }
            }
        },
        cssmin: {
            target: {
                files: {
                    "css/hux-blog.min.css": "css/hux-blog.css"
                }
            }
        },
        banner: '/*!\n' +
            ' * <%= pkg.title %> v<%= pkg.version %> (<%= pkg.homepage %>)\n' +
            ' * Copyright <%= grunt.template.today("yyyy") %> <%= pkg.author %>\n' +
            ' */\n',
        usebanner: {
            dist: {
                options: {
                    position: 'top',
                    banner: '<%= banner %>'
                },
                files: {
                    src: ['css/hux-blog.css', 'css/hux-blog.min.css', 'js/site.min.js']
                }
            }
        },
        watch: {
            scripts: {
                files: ['js/site.js'],
                tasks: ['uglify'],
                options: {
                    spawn: false,
                },
            },
            less: {
                files: ['less/*.less'],
                tasks: ['less'],
                options: {
                    spawn: false,
                }
            },
        },
    });

    // Load the plugins.
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-banner');
    grunt.loadNpmTasks('grunt-contrib-watch');
 
    // Default task(s).
    grunt.registerTask('default', ['uglify', 'less', 'cssmin', 'usebanner']);

};
