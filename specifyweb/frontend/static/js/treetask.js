define([
    'jquery', 'underscore', 'backbone', 'specifyapi', 'schema',
    'domain', 'remoteprefs', 'notfoundview', 'recordselector',
    'jquery-ctxmenu'
], function($, _, Backbone, api, schema, domain,
            remoteprefs, NotFoundView, RecordSelector) {
    "use strict";

    $.contextMenu({
        selector: ".tree-node .expander",
        items: {
            'open': {name: "Open form", icon: "form"},
            'query': {name: "Query", icon: "query"}
        },
        callback: function openForm(key, options) {
            var table = this.closest('.tree-view').data('table');
            var nodeId = this.closest('.tree-node').data('nodeId');
            var specifyModel = schema.getModel(table);
            switch (key) {
            case 'open':
                window.open(api.makeResourceViewUrl(specifyModel, nodeId));
                break;
            }
        }
    });

    var TreeNodeView = Backbone.View.extend({
        __name__: "TreeNodeView",
        tagName: "tr",
        className: "tree-node",
        events: {
            'click a.open': 'openNode',
            'click a.close': 'closeNode',
            'click a.reopen': 'reopenNode'
        },
        initialize: function(options) {
            this.table = options.table;
            this.ranks = options.ranks;
            this.path = options.path || [];
            this.baseUrl = options.baseUrl;
            this.specifyModel = schema.getModel(this.table);

            var i = 0;
            this.nodeId              = options.row[i++];
            this.name                = options.row[i++];
            this.fullName            = options.row[i++];
            this.nodeNumber          = options.row[i++];
            this.highestNodeNumber   = options.row[i++];
            this.rankId              = options.row[i++];
            this.children            = options.row[i++];
            this.allCOs              = options.row[i++];
            this.directCOs           = options.row[i++];
        },
        render: function() {
            var foundParentRank = false;
            var foundThisRank = false;
            var cells = _.map(this.ranks, function(rank) {
                if (this.path.length && rank == _.last(this.path).rankId) foundParentRank = true;
                if (rank == this.rankId) foundThisRank = true;
                var td = $('<td>');
                var ancestor = _.find(this.path, function(node) { return node.rankId == rank; });
                var ancestorPlus1 = this.path[1 + _.indexOf(this.path, ancestor)];
                if (ancestor && !(ancestorPlus1 && ancestorPlus1.isLastChild())) {
                    td.addClass('tree-vertical-edge');
                }
                if (rank == this.rankId) {
                    td.addClass('tree-node-cell');
                }
                if (foundParentRank && !foundThisRank) {
                    td.addClass('tree-horizontal-edge');
                }
                td.append('<p>');
                return td[0];
            }, this);
            var pathClasses = _.map(this.path.concat(this), function(node) { return 'nn-' + node.nodeId; }).join(' ');
            this.$el.addClass(pathClasses).append(cells).data('nodeId', this.nodeId);
            this.$('.tree-node-cell p')
                .append('<a class="ui-icon expander">')
                .append($('<a class="expander">').text(this.name));
            if (this.directCOs != null && this.allCOs != null) {
                var childCOs = this.allCOs - this.directCOs;
                this.$('.tree-node-cell p').append(' (' + this.directCOs + (childCOs > 0 ? ', ' + childCOs : '') +')');
            }
            if (this.children > 0) {
                this.$('.expander').addClass('open').attr('title', "" + this.children + (this.children > 1 ? " children" : " child"));
            } else {
                this.$('.expander').addClass('leaf');
            }
            return this;
        },
        openNode: function(event) {
            event.preventDefault();
            this.$('.expander').removeClass('open').addClass('wait');
            var tree = this.table.charAt(0).toUpperCase() + this.table.slice(1);
            var statsThreshold = remoteprefs['TreeEditor.Rank.Threshold.' + tree];
            var doStats = statsThreshold != null && statsThreshold <= this.rankId;
            $.getJSON(this.baseUrl + this.nodeId + '/?stats=' + doStats).done(this.addChildNodes.bind(this));
        },
        isLastChild: function() {
            var parent = _.last(this.path);
            if (parent == null) return true;
            return this === _.last(parent.childNodes);
        },
        addChildNodes: function(rows) {
            this.$('.expander').removeClass('wait').addClass('close');
            this.childNodes = _.map(rows, function(row) {
                return new TreeNodeView({
                    baseUrl: this.baseUrl,
                    table: this.table,
                    row: row,
                    ranks: this.ranks,
                    path: this.path.concat(this)
                });
            }, this);

            this.$el.after(_.map(this.childNodes, function(node) { return node.render().el; }));
        },
        closeNode: function(event) {
            event.preventDefault();
            this.$('.expander').removeClass('close').addClass('reopen');
            $('.nn-' + this.nodeId).hide();
            this.$el.show();
        },
        reopenNode: function(event) {
            event.preventDefault();
            this.$('.expander').removeClass('reopen').addClass('close');
            $('.nn-' + this.nodeId).show();
        }
    });

    var TreeHeader = Backbone.View.extend({
        __name__: "TreeHeader",
        className: "tree-header",
        tagName: "thead",
        initialize: function(options) {
            this.treeDefItems = options.treeDefItems;
        },
        render: function() {
            var headings = _.map(this.treeDefItems, function(tdi) {
                return $('<th>').text(tdi.get('name'))[0];
            }, this);
            $('<tr>').append(headings).appendTo(this.el);
            return this;
        }
    });

    var TreeView = Backbone.View.extend({
        __name__: "TreeView",
        className: "tree-view",
        initialize: function(options) {
            this.table = options.table;
            this.treeDef = options.treeDef;
            this.treeDefItems = options.treeDefItems.models;

            this.Collection = schema.getModel(options.table).LazyCollection;
            this.ranks = _.map(this.treeDefItems, function(tdi) { return tdi.get('rankid'); });
            this.baseUrl = '/api/specify_tree/' + this.table + '/' + this.treeDef.id + '/';
        },
        render: function() {
            this.$el.data('table', this.table);
            var title = schema.getModel(this.table).getLocalizedName() + " Tree";
            $('<h1>').text(title).appendTo(this.el);
            var columnDefs = $('<colgroup>').append(_.map(this.ranks, function() {
                return $('<col>', {width: (100/this.ranks.length) + '%'})[0];
            }, this));
            $('<table>').appendTo(this.el).append(
                columnDefs,
                new TreeHeader({treeDefItems: this.treeDefItems}).render().el,
                $('<tfoot>').append(_.map(this.ranks, function() { return $('<th>')[0]; })),
                '<tr class="loading"><td>(loading...)</td></tr>'
            );
            $.getJSON(this.baseUrl + 'null/')
                .done(this.gotRows.bind(this));
            return this;
        },
        gotRows: function(rows) {
            this.$('tr.loading').remove();
            this.$('table').append(
                _.map(rows, function(row) {
                    return new TreeNodeView({ row: row, table: this.table, ranks: this.ranks, baseUrl: this.baseUrl })
                        .render().$el[0];
                }, this)
            );
        }
    });

    return function(app) {
        app.router.route('tree/:table/', 'tree', function(table) {
            var getTreeDef = domain.getTreeDef(table);
            if (!getTreeDef) {
                app.setCurrentView(new NotFoundView());
                return;
            }
            getTreeDef.done(function(treeDef) {

                treeDef.rget('treedefitems').pipe(function (treeDefItems) {
                    return treeDefItems.fetch({limit: 0}).pipe(function() { return treeDefItems; });
                }).done(function(treeDefItems) {
                    app.setCurrentView(new TreeView({
                        table: table,
                        treeDef: treeDef,
                        treeDefItems: treeDefItems
                    }));
                });
            });
        });
    };
});
